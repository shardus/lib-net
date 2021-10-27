use super::runtime::RUNTIME;
use crate::oneshot::Sender;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::{Mutex, OnceCell};

pub struct ShardusNetSender {
    send_channel: UnboundedSender<(SocketAddr, String, Sender<()>)>,
}

impl ShardusNetSender {
    pub fn new() -> Self {
        let (send_channel, send_channel_rx) = unbounded_channel();

        Self::spawn_sender(send_channel_rx);

        Self { send_channel }
    }

    pub fn send(&self, address: SocketAddr, data: String, complete_tx: Sender<()>) {
        self.send_channel
            .send((address, data, complete_tx))
            .expect("Failed to send data to channel");
    }

    fn spawn_sender(send_channel_rx: UnboundedReceiver<(SocketAddr, String, Sender<()>)>) {
        RUNTIME.spawn(async move {
            let mut connections = HashMap::<SocketAddr, Arc<Mutex<Connection>>>::new();
            let mut send_channel_rx = send_channel_rx;

            while let Some((address, data, complete_tx)) = send_channel_rx.recv().await {
                let connection = connections
                    .entry(address)
                    .or_insert_with(|| Arc::new(Mutex::new(Connection::new(address))))
                    .clone();

                RUNTIME.spawn(async move {
                    let connection = connection.lock().await;
                    connection.send(&data).await;
                    complete_tx.send(()).expect("Failed to send complete");
                });
            }
        });
    }
}

struct Connection {
    address: SocketAddr,
    socket: OnceCell<Mutex<TcpStream>>,
}

impl Connection {
    fn new(address: SocketAddr) -> Self {
        let socket = OnceCell::new();

        Self { address, socket }
    }

    async fn send(&self, data: &str) {
        let mut socket = self
            .socket
            .get_or_init(|| async {
                Mutex::new(
                    TcpStream::connect(self.address)
                        .await
                        .expect("Failed to connect to socket"),
                )
            })
            .await
            .lock()
            .await;

        socket
            .write_u32(data.len() as u32)
            .await
            .expect("Failed to send buffer length");
        socket
            .write_all(data.as_bytes())
            .await
            .expect("Failed to send buffer data");
    }
}
