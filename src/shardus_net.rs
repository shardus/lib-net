use std::net::{SocketAddr, ToSocketAddrs};
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use super::runtime::RUNTIME;

pub struct ShardusNet {
    address: SocketAddr,
}

impl ShardusNet {
    pub fn new<A: ToSocketAddrs>(address: A) -> Result<Self, ()> {
        let mut addresses = address.to_socket_addrs().map_err(|_| ())?;
        let address = addresses.next().ok_or_else(|| ())?;
        Ok(ShardusNet { address })
    }

    pub fn listen(&self) -> UnboundedReceiver<String> {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        Self::spawn_listener(self.address.clone(), tx);
        rx
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
                let msg_len = socket.read_u32().await.unwrap() as usize;
                let mut buffer = Vec::with_capacity(msg_len);
                buffer.resize(msg_len, 0);
                socket.read_exact(&mut buffer).await.unwrap();
                let msg = String::from_utf8(buffer).unwrap();
                tx.send(msg).unwrap();
            });
        }
    }
}
