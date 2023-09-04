use crate::header_factory::header_deserialize_factory;
use crate::headers::header_types::WrappedHeader;

use super::runtime::RUNTIME;

use log::{error, info};
use std::io::Cursor;
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

    pub fn listen(&self) -> UnboundedReceiver<(String, SocketAddr, Option<WrappedHeader>)> {
        Self::spawn_listener(self.address)
    }

    fn spawn_listener(address: SocketAddr) -> UnboundedReceiver<(String, SocketAddr, Option<WrappedHeader>)> {
        let (tx, rx) = unbounded_channel();
        RUNTIME.spawn(Self::bind_to_socket(address, tx));
        rx
    }

    async fn bind_to_socket(address: SocketAddr, tx: UnboundedSender<(String, SocketAddr, Option<WrappedHeader>)>) {
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

    async fn accept_connections(listener: TcpListener, received_msg_tx: UnboundedSender<(String, SocketAddr, Option<WrappedHeader>)>) -> std::io::Result<()> {
        loop {
            let (socket, remote_addr) = listener.accept().await?;
            let received_msg_tx = received_msg_tx.clone();

            RUNTIME.spawn(async move {
                let result = Self::receive(socket, remote_addr, received_msg_tx).await;
                match result {
                    Ok(_) => info!("Connection safely completed and shutdown with {}", remote_addr),
                    Err(err) => {
                        error!("Connection to {} failed with Error: {}", remote_addr, err)
                    }
                };
            });
        }
    }

    async fn receive(socket_stream: TcpStream, remote_addr: SocketAddr, received_msg_tx: UnboundedSender<(String, SocketAddr, Option<WrappedHeader>)>) -> ListenerResult<()> {
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

            // TODO_HEADERS: we need to keep this message in buffer (vec<U8>) form longer until we get to
            // code that parses the different kinds of messages.

            if !buffer.is_empty() && buffer[0] == 0x1 {
                // Header is present
                let header_version = buffer[1];
                let msg_bytes = &buffer[2..];

                let cursor = Cursor::new(msg_bytes);
                let header = header_deserialize_factory(header_version, cursor.get_ref().to_vec()).expect("Failed to deserialize header");
                let header_length = cursor.position() as usize;

                let remaining_msg_bytes = &msg_bytes[header_length..];
                if header.validate(remaining_msg_bytes.to_vec()) == false {
                    error!("Failed to validate header");
                    continue;
                }

                let wrapped_header = WrappedHeader {
                    version: header_version,
                    header_json_string: header.to_json_string().expect("Failed to serialize header"),
                };

                // deserialize remaining bytes as your message
                let msg = String::from_utf8(remaining_msg_bytes.to_vec())?;
                received_msg_tx.send((msg, remote_addr, Some(wrapped_header))).map_err(|_| SendError(()))?;
            } else {
                // No header present
                let msg = String::from_utf8(buffer)?;
                received_msg_tx.send((msg, remote_addr, None)).map_err(|_| SendError(()))?;
            }
        }

        Ok(())
    }
}
