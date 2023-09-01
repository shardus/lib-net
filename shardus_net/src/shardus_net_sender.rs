use super::runtime::RUNTIME;
use crate::header_factory::header_serialize_factory;
use crate::headers::header_types::Header;
use crate::oneshot::Sender;
use log::{error, info};
use std::collections::HashMap;

use std::io;
use std::net::SocketAddr;

use lru::LruCache;
use std::sync::Arc;
use thiserror::Error;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::Mutex;

#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum SenderError {
    #[error("Failed to connect to {1} with error {0}")]
    ConnectionFailedError(std::io::Error, SocketAddr),
    #[error("Failed to send to {1} with error {0}")]
    SendFailedError(std::io::Error, SocketAddr),
}

pub type SendResult = Result<(), SenderError>;

pub struct ShardusNetSender {
    send_channel: UnboundedSender<(SocketAddr, Vec<u8>, Sender<SendResult>)>,
    evict_socket_channel: UnboundedSender<SocketAddr>,
}

impl ShardusNetSender {
    pub fn new(connections: Arc<Mutex<dyn ConnectionCache + Send>>) -> Self {
        let (send_channel, send_channel_rx) = unbounded_channel();
        let (evict_socket_channel, evict_socket_channel_rx) = unbounded_channel();

        Self::spawn_sender(send_channel_rx, Arc::clone(&connections));
        Self::spawn_evictor(evict_socket_channel_rx, Arc::clone(&connections));

        Self { send_channel, evict_socket_channel }
    }

    // send: send data to a socket address without a header
    pub fn send(&self, address: SocketAddr, data: String, complete_tx: Sender<SendResult>) {
        let data = data.into_bytes();
        self.send_channel
            .send((address, data, complete_tx))
            .expect("Unexpected! Failed to send data to channel. Sender task must have been dropped.");
    }

    pub fn send_with_headers(&self, address: SocketAddr, header_version: u8, header: Header, data: Vec<u8>, complete_tx: Sender<SendResult>) {
        let serialized_header = header_serialize_factory(header_version, header).expect("Failed to serialize header");
        let data = [serialized_header, data].concat();
        self.send_channel
            .send((address, data, complete_tx))
            .expect("Unexpected! Failed to send data with headers to channel. Sender task must have been dropped.");
    }

    pub fn evict_socket(&self, address: SocketAddr) {
        self.evict_socket_channel
            .send(address)
            .expect("Unexpected! Failed to send data to channel. Socket evictor task must have been dropped.");
    }

    fn spawn_evictor(evict_socket_channel_rx: UnboundedReceiver<SocketAddr>, connections: Arc<Mutex<dyn ConnectionCache + Send>>) {
        RUNTIME.spawn(async move {
            let mut evict_socket_channel_rx = evict_socket_channel_rx;

            while let Some(address) = evict_socket_channel_rx.recv().await {
                let mut connections = connections.lock().await;
                connections.remove(&address);
                info!("Evicted socket {} from cache", address);
            }

            info!("Evictor channel complete. Shutting down evictor task.")
        });
    }

    fn spawn_sender(send_channel_rx: UnboundedReceiver<(SocketAddr, Vec<u8>, Sender<SendResult>)>, connections: Arc<Mutex<dyn ConnectionCache + Send>>) {
        RUNTIME.spawn(async move {
            let mut send_channel_rx = send_channel_rx;

            while let Some((address, data, complete_tx)) = send_channel_rx.recv().await {
                let connection = {
                    let mut connections = connections.lock().await;
                    connections.get_or_insert(address)
                };

                RUNTIME.spawn(async move {
                    let result = connection.send(data).await;
                    complete_tx.send(result).ok();
                });
            }

            info!("Sending channel complete. Shutting down sending task.")
        });
    }
}

pub struct Connection {
    address: SocketAddr,
    socket: Mutex<Option<TcpStream>>,
}

impl Connection {
    fn new(address: SocketAddr) -> Self {
        let socket = Mutex::new(None);

        Self { address, socket }
    }

    async fn send(&self, data: Vec<u8>) -> SendResult {
        let mut socket = self.socket.lock().await;
        let socket_op = &mut (*socket);

        let socket = Self::connect_and_set_socket_if_none(socket_op, self.address).await?;

        let result = Self::write_data_to_stream(socket, data.clone()).await;

        if result.is_err() {
            info!("Failed to send data to {}. Attempting to reconnect and try again.", self.address);

            // There was an error sending data. The connection might have been previously closed.
            *socket_op = None;

            // Since there was an error previously, try reconnecting to the socket and resending the data.
            let socket = Self::connect_and_set_socket_if_none(socket_op, self.address).await?;
            let result = Self::write_data_to_stream(socket, data).await;

            // If there is still an error even after the retry, return as failure to send.
            if let Err(error) = result {
                return Err(SenderError::SendFailedError(error, self.address));
            }
        }

        Ok(())
    }

    async fn connect_and_set_socket_if_none(socket_op: &mut Option<TcpStream>, address: SocketAddr) -> Result<&mut TcpStream, SenderError> {
        let was_socket_none = socket_op.is_none();

        if was_socket_none {
            let connection_stream = TcpStream::connect(address).await;

            match connection_stream {
                Ok(connection_stream) => *socket_op = Some(connection_stream),
                Err(error) => return Err(SenderError::ConnectionFailedError(error, address)),
            }
        }

        let socket = socket_op.as_mut().expect("Unexpected! This socket has already been checked to exist.");

        Ok(socket)
    }

    async fn write_data_to_stream(socket: &mut TcpStream, data: Vec<u8>) -> io::Result<()> {
        let len = data.len() as u32;
        socket.write_u32(len).await?;
        socket.write_all(&data).await
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        if let Some(mut stream) = self.socket.get_mut().take() {
            RUNTIME.spawn(async move {
                stream.shutdown().await.ok();
            });
        }
    }
}

pub trait ConnectionCache {
    fn get_or_insert(&mut self, address: SocketAddr) -> Arc<Connection>;
    fn remove(&mut self, address: &SocketAddr) -> Option<Arc<Connection>>;
}

impl ConnectionCache for HashMap<SocketAddr, Arc<Connection>> {
    fn get_or_insert(&mut self, address: SocketAddr) -> Arc<Connection> {
        self.entry(address).or_insert_with(|| Arc::new(Connection::new(address))).clone()
    }

    fn remove(&mut self, address: &SocketAddr) -> Option<Arc<Connection>> {
        self.remove(address)
    }
}

impl ConnectionCache for LruCache<SocketAddr, Arc<Connection>> {
    fn get_or_insert(&mut self, address: SocketAddr) -> Arc<Connection> {
        info!("LruCache stats, current_size: {}, capacity: {}", self.len(), self.cap());
        match self.get(&address) {
            Some(connection) => connection.clone(),
            None => {
                let connection = Arc::new(Connection::new(address));
                // `put` used instead of push to avoid memory leak.
                self.put(address, connection.clone());
                connection
            }
        }
    }

    fn remove(&mut self, address: &SocketAddr) -> Option<Arc<Connection>> {
        self.pop(address)
    }
}
