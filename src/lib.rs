use neon::{prelude::*, result::Throw};

mod shardus_net;

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

    // let callback = cx.argument::<JsFunction>(0)?.root(cx);
    // let callback = callback.into_inner(cx);
    // let this = cx.undefined();
    // let args = iter::empty::<Handle<JsValue>>();

    // callback.call(cx, this, args)?;

    Ok(shardus_net)
}

fn listen(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let cx = &mut cx;
    let shardus_net = cx.this();
    let shardus_net = shardus_net.get(cx, "_inner")?;
    let shardus_net = shardus_net.downcast_or_throw::<JsBox<ShardusNet>, _>(cx)?;

    shardus_net.listen();

    Ok(cx.undefined())
}

fn create_shardus_net_inner(cx: &mut FunctionContext) -> Result<ShardusNet, Throw> {
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
        Ok(address) => Ok(address),
        Err(_) => cx.throw_type_error("The provided address is not valid")?
    }
}

impl Finalize for ShardusNet {}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("Sn", create_shardus_net)?;

    Ok(())
}
