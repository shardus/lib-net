use std::{net::ToSocketAddrs, sync::Arc};

use neon::{prelude::*, result::Throw};

mod runtime;
mod shardus_net_listener;
mod shardus_net_sender;

use runtime::RUNTIME;
use shardus_net_listener::ShardusNetListener;
use shardus_net_sender::ShardusNetSender;
use tokio::sync::oneshot;

const DEFAULT_ADDRESS: &str = "0.0.0.0";

fn create_shardus_net(mut cx: FunctionContext) -> JsResult<JsObject> {
    let cx = &mut cx;
    let shardus_net_listener = create_shardus_net_listener(cx)?;
    let shardus_net_sender = create_shardus_net_sender();
    let shardus_net_listener = cx.boxed(shardus_net_listener);
    let shardus_net_sender = cx.boxed(shardus_net_sender);

    let shardus_net = cx.empty_object();

    let listen = JsFunction::new(cx, listen)?;
    let send = JsFunction::new(cx, send)?;

    shardus_net.set(cx, "_listener", shardus_net_listener)?;
    shardus_net.set(cx, "_sender", shardus_net_sender)?;
    shardus_net.set(cx, "listen", listen)?;
    shardus_net.set(cx, "send", send)?;

    Ok(shardus_net)
}

fn listen(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let cx = &mut cx;
    let callback = cx.argument::<JsFunction>(0)?.root(cx);
    let shardus_net_listener = cx
        .this()
        .get(cx, "_listener")?
        .downcast_or_throw::<JsBox<Arc<ShardusNetListener>>, _>(cx)?;

    let shardus_net_listener = (**shardus_net_listener).clone();
    let channel = cx.channel();

    RUNTIME.spawn(async move {
        let mut rx = shardus_net_listener.listen();
        let callback = Arc::new(callback);

        while let Some((msg, remote_address)) = rx.recv().await {
            let callback = callback.clone();
            let channel = channel.clone();

            RUNTIME.spawn_blocking(move || {
                channel.send(move |mut cx| {
                    let cx = &mut cx;
                    let this = cx.undefined();
                    let message = cx.string(msg);
                    let remote_ip = cx.string(remote_address.ip().to_string());
                    let remote_port = cx.number(remote_address.port());
                    let args: [Handle<JsValue>; 3] =
                        [message.upcast(), remote_ip.upcast(), remote_port.upcast()];

                    callback.to_inner(cx).call(cx, this, args)?;

                    Ok(())
                });
            });
        }
    });

    Ok(cx.undefined())
}

fn send(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let cx = &mut cx;
    let port = cx.argument::<JsNumber>(0)?.value(cx);
    let host = cx.argument::<JsString>(1)?.value(cx);
    let data = cx.argument::<JsString>(2)?.value(cx);
    let complete_cb = cx.argument::<JsFunction>(3)?.root(cx);
    let shardus_net_sender = cx
        .this()
        .get(cx, "_sender")?
        .downcast_or_throw::<JsBox<Arc<ShardusNetSender>>, _>(cx)?;
    let channel = cx.channel();
    let (complete_tx, complete_rx) = oneshot::channel::<()>();

    RUNTIME.spawn(async move {
        complete_rx
            .await
            .expect("Complete send tx dropped before notify");

        RUNTIME.spawn_blocking(move || {
            channel.send(move |mut cx| {
                let cx = &mut cx;
                let this = cx.undefined();
                let args: [Handle<JsValue>; 0] = [];

                complete_cb.to_inner(cx).call(cx, this, args)?;

                Ok(())
            });
        });
    });

    match (host, port as u16).to_socket_addrs() {
        Ok(mut address) => {
            let address = address.next().expect("Expected at least one address");
            shardus_net_sender.send(address, data, complete_tx);

            Ok(cx.undefined())
        }
        Err(_) => cx.throw_type_error("The provided address is not valid"),
    }
}

fn create_shardus_net_listener(cx: &mut FunctionContext) -> Result<Arc<ShardusNetListener>, Throw> {
    let opts = cx.argument::<JsObject>(0)?;

    let port = opts
        .get(cx, "port")?
        .downcast_or_throw::<JsNumber, _>(cx)?
        .value(cx);

    let host = opts
        .get(cx, "address")
        .ok()
        .map(|v| v.downcast_or_throw::<JsString, _>(cx))
        .transpose()?
        .map(|v| v.value(cx))
        .unwrap_or_else(|| DEFAULT_ADDRESS.to_string());

    // @TODO: Verify that a javascript number properly converts here without loss.
    let address = (host, port as u16);

    let shardus_net = ShardusNetListener::new(address);

    match shardus_net {
        Ok(net) => Ok(Arc::new(net)),
        Err(_) => cx.throw_type_error("The provided address is not valid")?,
    }
}

fn create_shardus_net_sender() -> Arc<ShardusNetSender> {
    Arc::new(ShardusNetSender::new())
}

impl Finalize for ShardusNetListener {}
impl Finalize for ShardusNetSender {}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("Sn", create_shardus_net)?;

    Ok(())
}
