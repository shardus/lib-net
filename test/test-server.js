const Sn = require('../.')

const address = '127.0.0.1'
const port = 5001

const sn = Sn.Sn({
  address,
  port
})

// net.listen(port, address, (data) => console.log(data));

const main = async () => {
  await sn.listen((data, remote, respond) => {
    console.log(`Received: ${data.length} from ${JSON.stringify(remote)}`);

    if (!data.startsWith('Response')) {
      respond("Response message");
    }
  })
}

main()

function wait() {
  setTimeout(wait, 1000);
};

wait()
