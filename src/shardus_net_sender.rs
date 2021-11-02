use super::runtime::RUNTIME;
use crate::oneshot::Sender;
use log::{error, info};
use std::collections::HashMap;

use std::net::SocketAddr;

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
    send_channel: UnboundedSender<(SocketAddr, String, Sender<SendResult>)>,
}

impl ShardusNetSender {
    pub fn new() -> Self {
        let (send_channel, send_channel_rx) = unbounded_channel();

        Self::spawn_sender(send_channel_rx);

        Self { send_channel }
    }

    pub fn send(&self, address: SocketAddr, data: String, complete_tx: Sender<SendResult>) {
        self.send_channel.send((address, data, complete_tx)).expect(
            "Unexpected! Failed to send data to channel. Sender task must have been dropped.",
        );
    }

    fn spawn_sender(send_channel_rx: UnboundedReceiver<(SocketAddr, String, Sender<SendResult>)>) {
        RUNTIME.spawn(async move {
            let mut connections = HashMap::<SocketAddr, Arc<Connection>>::new();
            let mut send_channel_rx = send_channel_rx;

            while let Some((address, data, complete_tx)) = send_channel_rx.recv().await {
                let connection = connections
                    .entry(address)
                    .or_insert_with(|| Arc::new(Connection::new(address)))
                    .clone();

                RUNTIME.spawn(async move {
                    let result = connection.send(&data).await;
                    complete_tx.send(result).ok();
                });
            }

            info!("Sending channel complete. Shutting down sending task.")
        });
    }
}

struct Connection {
    address: SocketAddr,
    socket: Mutex<Option<TcpStream>>,
}

impl Connection {
    fn new(address: SocketAddr) -> Self {
        let socket = Mutex::new(None);

        Self { address, socket }
    }

    async fn send(&self, data: &str) -> Result<(), SenderError> {
        let mut socket = self.socket.lock().await;
        let socket_op = &mut (*socket);

        if socket_op.is_none() {
            let connection_stream = TcpStream::connect(self.address).await;

            match connection_stream {
                Ok(connection_stream) => *socket_op = Some(connection_stream),
                Err(error) => return Err(SenderError::ConnectionFailedError(error, self.address)),
            }
        }

        let socket = socket_op
            .as_mut()
            .expect("Unexpected! This socket has already been checked to exist.");

        let len = data.len() as u32;
        let result = socket.write_u32(len).await;

        if let Err(error) = result {
            *socket_op = None;
            return Err(SenderError::SendFailedError(error, self.address));
        }

        let result = socket.write_all(data.as_bytes()).await;

        if let Err(error) = result {
            *socket_op = None;
            return Err(SenderError::SendFailedError(error, self.address));
        }

        Ok(())
    }
}
