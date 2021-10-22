use std::sync::Arc;

use neon::{prelude::*, result::Throw};

mod runtime;
mod shardus_net;

use runtime::RUNTIME;
use shardus_net::ShardusNet;

const DEFAULT_ADDRESS: &str = "0.0.0.0";

fn create_shardus_net(mut cx: FunctionContext) -> JsResult<JsObject> {
    let cx = &mut cx;
    let shardus_net_inner = create_shardus_net_inner(cx)?;
    let shardus_net_inner = cx.boxed(shardus_net_inner);

    let shardus_net = cx.empty_object();

    let listen = JsFunction::new(cx, listen)?;

    shardus_net.set(cx, "_inner", shardus_net_inner)?;
    shardus_net.set(cx, "listen", listen)?;

    Ok(shardus_net)
}

fn listen(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let cx = &mut cx;
    let callback = cx.argument::<JsFunction>(0)?.root(cx);
    let shardus_net = cx
        .this()
        .get(cx, "_inner")?
        .downcast_or_throw::<JsBox<Arc<ShardusNet>>, _>(cx)?;

    let shardus_net = (**shardus_net).clone();
    let channel = cx.channel();

    RUNTIME.spawn(async move {
        let mut rx = shardus_net.listen();
        let callback = Arc::new(callback);

        if let Some(msg) = rx.recv().await {
            let callback = callback.clone();

            RUNTIME.spawn_blocking(move || {
                channel.send(move |mut cx| {
                    let cx = &mut cx;
                    let this = cx.undefined();
                    let args = [cx.string(msg)];

                    callback.to_inner(cx).call(cx, this, args)?;

                    Ok(())
                });
            });
        }
    });

    Ok(cx.undefined())
}

fn create_shardus_net_inner(cx: &mut FunctionContext) -> Result<Arc<ShardusNet>, Throw> {
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
        .unwrap_or(DEFAULT_ADDRESS.to_string());

    // @TODO: Verify that a javascript number properly converts here without loss.
    let address = (host, port as u16);

    let shardus_net = ShardusNet::new(address);

    match shardus_net {
        Ok(net) => Ok(Arc::new(net)),
        Err(_) => cx.throw_type_error("The provided address is not valid")?,
    }
}

impl Finalize for ShardusNet {}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("Sn", create_shardus_net)?;

    Ok(())
}
