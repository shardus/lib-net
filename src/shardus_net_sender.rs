use super::runtime::RUNTIME;
use std::collections::HashMap;
use std::net::SocketAddr;
use tokio::net::TcpStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::{Mutex, OnceCell};
use tokio::io::AsyncWriteExt;

pub struct ShardusNetSender {
    send_channel: UnboundedSender<(SocketAddr, String)>,
}

impl ShardusNetSender {
    pub fn new() -> Self {
        let (send_channel, send_channel_rx) = unbounded_channel();

        Self::spawn_sender(send_channel_rx);

        Self { send_channel }
    }

    pub fn send(&self, address: SocketAddr, data: String) {
        self.send_channel.send((address, data)).expect("Failed to send data to channel");
    }

    fn spawn_sender(send_channel_rx: UnboundedReceiver<(SocketAddr, String)>) {
        RUNTIME.spawn(async move {
            let mut connections = HashMap::<SocketAddr, Connection>::new();
            let mut send_channel_rx = send_channel_rx;

            while let Some((address, data)) = send_channel_rx.recv().await {
                // @TODO: Spawn tasks and lock per connection. Otherwise all outbound traffic is sync.
                if let Some(connection) = connections.get(&address) {
                    connection.send(&data).await;
                } else {
                    let connection = connections
                        .entry(address)
                        .or_insert_with(|| Connection::new(address));

                    connection.send(&data).await;
                }
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

    async fn send(&self, data: &str) -> () {
        let mut socket = self
            .socket
            .get_or_init(|| async { Mutex::new(TcpStream::connect(self.address).await.expect("Failed to connect to socket")) })
            .await
            .lock()
            .await;

        socket.write_u32(data.len() as u32).await.expect("Failed to send buffer length");
        socket.write_all(data.as_bytes()).await.expect("Failed to send buffer data");
    }
}
