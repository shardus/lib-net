use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs};
use std::slice::SliceIndex;
use std::sync::Mutex;
use neon::context::Context;
use neon::prelude::Handle;
use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use super::runtime::RUNTIME;

pub struct ShardusNet {
    address: SocketAddr,
    connections: Mutex<HashMap<SocketAddr, Connection>>
}

impl ShardusNet {
    pub fn new<A: ToSocketAddrs>(address: A) -> Result<Self, ()> {
        let mut addresses = address.to_socket_addrs().map_err(|_| ())?;
        let address = addresses.next().ok_or_else(|| ())?;
        let connections = Mutex::new(HashMap::new());
        Ok(ShardusNet { address, connections })
    }

    pub fn listen(&self) -> UnboundedReceiver<String> {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        Self::spawn_listener(self.address.clone(), tx);
        rx
    }

    pub fn send(&self, address: SocketAddr, data: &str) {
        let connections = *self.connections.lock().unwrap();

        let connection = connections.entry(address).or_insert_with(|| Connection::new());

        connection.send(data);
    }

    fn spawn_listener(address: SocketAddr, tx: UnboundedSender<String>) {
        RUNTIME.spawn(Self::connect(address, tx));
    }

    async fn connect(address: SocketAddr, tx: UnboundedSender<String>) {
        // @TODO: Clean up all of the unwraps;
        let listener = TcpListener::bind(address).await.unwrap();

        loop {
            let (mut socket, _) = listener.accept().await.expect("Failed to connect");
            let tx = tx.clone();

            RUNTIME.spawn(async move {
                while let Ok(msg_len) = socket.read_u32().await {
                    let msg_len = msg_len as usize;
                    let mut buffer = Vec::with_capacity(msg_len);

                    // @TODO: We should do a security check in the case that a sender sends an incorrect length.

                    // SAFETY: We can set the length of the vec here since we know that:
                    // 1. The capacity has been set above and the length is <= capacity.
                    // 2. We are calling read_exact which will fill the full length of the array.
                    unsafe { buffer.set_len(msg_len); }

                    socket.read_exact(&mut buffer).await.unwrap();
                    let msg = String::from_utf8(buffer).unwrap();
                    tx.send(msg).unwrap();
                }
            });
        }
    }
}

struct Connection {
    address: SocketAddr,
    rx: UnboundedReceiver<String>,
    tx: UnboundedSender<String>
}

impl Connection {
    fn new() -> Self {

    }

    fn send(&self, data: &str) -> () {
        todo!()
    }
}
