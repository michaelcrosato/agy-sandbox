import http from "http";

const port = 28196;
const server = http.createServer((req, res) => {
  res.end("ok");
});

server.listen(port, () => {
  process.stdout.write("READY\n");
});

setInterval(() => {}, 1000);
