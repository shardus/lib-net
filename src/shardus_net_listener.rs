use super::runtime::RUNTIME;

use log::{error, info};
use std::net::{SocketAddr, ToSocketAddrs};
use std::string::FromUtf8Error;
use thiserror::Error;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;
use tokio::net::TcpStream;
use tokio::sync::mpsc::error::SendError;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

pub struct ShardusNetListener {
    address: SocketAddr,
}

#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum ListenerError {
    #[error("Failed to parse data as Utf8. {0}")]
    ParseDataAsUtf8Error(#[from] FromUtf8Error),
    #[error("Failed to notify callback with received message. {0}")]
    SendCompleteError(#[from] SendError<()>),
    #[error("Failed to read from TCPStream. {0}")]
    ReadStreamError(#[from] std::io::Error),
}

type ListenerResult<T> = Result<T, ListenerError>;

impl ShardusNetListener {
    pub fn new<A: ToSocketAddrs>(address: A) -> Result<Self, ()> {
        let mut addresses = address.to_socket_addrs().map_err(|_| ())?;
        let address = addresses.next().ok_or(())?;

        Ok(Self { address })
    }

    pub fn listen(&self) -> UnboundedReceiver<(String, SocketAddr)> {
        Self::spawn_listener(self.address)
    }

    fn spawn_listener(address: SocketAddr) -> UnboundedReceiver<(String, SocketAddr)> {
        let (tx, rx) = unbounded_channel();
        RUNTIME.spawn(Self::bind_to_socket(address, tx));
        rx
    }

    async fn bind_to_socket(address: SocketAddr, tx: UnboundedSender<(String, SocketAddr)>) {
        loop {
            let listener = TcpListener::bind(address).await;

            match listener {
                Ok(listener) => {
                    let tx = tx.clone();
                    match Self::accept_connections(listener, tx).await {
                        Ok(_) => unreachable!(),
                        Err(err) => {
                            error!("Failed to accept connection to {} due to {}", address, err)
                        }
                    }
                }
                Err(err) => error!("Failed to listen to {} due to {}", address, err),
            };

            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    }

    async fn accept_connections(
        listener: TcpListener,
        received_msg_tx: UnboundedSender<(String, SocketAddr)>,
    ) -> std::io::Result<()> {
        loop {
            let (socket, remote_addr) = listener.accept().await?;
            let received_msg_tx = received_msg_tx.clone();

            RUNTIME.spawn(async move {
                let result = Self::receive(socket, remote_addr, received_msg_tx).await;
                match result {
                    Ok(_) => info!(
                        "Connection safely completed and shutdown with {}",
                        remote_addr
                    ),
                    Err(err) => {
                        error!("Connection to {} failed with Error: {}", remote_addr, err)
                    }
                };
            });
        }
    }

    async fn receive(
        socket_stream: TcpStream,
        remote_addr: SocketAddr,
        received_msg_tx: UnboundedSender<(String, SocketAddr)>,
    ) -> ListenerResult<()> {
        let mut socket_stream = socket_stream;
        while let Ok(msg_len) = socket_stream.read_u32().await {
            let msg_len = msg_len as usize;
            let mut buffer = Vec::with_capacity(msg_len);

            // @TODO: Do a security check in the case that a sender sends an incorrect length.

            // SAFETY: We can set the length of the vec here since we know that:
            // 1. The capacity has been set above and the length is <= capacity.
            // 2. We are calling read_exact which will fill the full length of the array.
            unsafe {
                buffer.set_len(msg_len);
            }

            socket_stream.read_exact(&mut buffer).await?;

            let msg = String::from_utf8(buffer)?;
            received_msg_tx
                .send((msg, remote_addr))
                .map_err(|_| SendError(()))?;
        }

        Ok(())
    }
}
