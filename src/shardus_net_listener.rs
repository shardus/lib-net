use std::net::{SocketAddr, ToSocketAddrs};
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use super::runtime::RUNTIME;

pub struct ShardusNetListener {
    address: SocketAddr
}

impl ShardusNetListener {
    pub fn new<A: ToSocketAddrs>(address: A) -> Result<Self, ()> {
        let mut addresses = address.to_socket_addrs().map_err(|_| ())?;
        let address = addresses.next().ok_or_else(|| ())?;

        Ok(Self { address })
    }

    pub fn listen(&self) -> UnboundedReceiver<String> {
        Self::spawn_listener(self.address.clone())
    }

    fn spawn_listener(address: SocketAddr) -> UnboundedReceiver<String> {
        let (tx, rx) = unbounded_channel();
        RUNTIME.spawn(Self::receive(address, tx));
        rx
    }

    async fn receive(address: SocketAddr, tx: UnboundedSender<String>) {
        // @TODO: Clean up all of the unwraps;
        let listener = TcpListener::bind(address).await.expect("Failed to listen to port");

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

                    socket.read_exact(&mut buffer).await.expect("Failed to read data");
                    let msg = String::from_utf8(buffer).expect("Failed to convert data to utf8");
                    tx.send(msg).expect("Failed to send message to transmitter");
                }
            });
        }
    }
}
