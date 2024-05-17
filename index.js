const http = require("http");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const cors = require("cors");
const chokidar = require("chokidar");
const { Server: SocketServer } = require("socket.io");

const pty = require("node-pty");

const ptyProcess = pty.spawn("bash", [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.INIT_CWD + "/user",
  env: process.env,
});

const app = express();
const server = http.createServer(app);
const io = new SocketServer({
  cors: "*",
});
app.use(cors());

io.attach(server);

chokidar.watch("./user").on("all", (event, path) => {
  io.emit("file:refresh", path);
});

ptyProcess.onData((data) => {
  io.emit("terminal:data", data);
});

io.on("connection", (socket) => {
  console.log("User connected at ", socket.id);
  socket.on("terminal:write", (data) => {
    ptyProcess.write(data);
  });

  socket.on("file:change", async ({ path, content }) => {
    // console.log(content)
    await fs.writeFile(`./user/${path}`, content);
  });
});

app.get("/files", async (req, res) => {
  const fileTree = await generateFileTree("./user");
  return res.json({ tree: fileTree });
});

async function generateFileTree(directory) {
  const tree = {};

  async function buildTree(currentDir, currentTree) {
    const files = await fs.readdir(currentDir);
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        currentTree[file] = {};
        await buildTree(filePath, currentTree[file]);
      } else {
        currentTree[file] = null;
      }
    }
  }
  await buildTree(directory, tree);
  return tree;
}

app.get("/files/content", async (req, res) => {
  const filePath = path.join(__dirname, "./user", req.query.path);
  const content = await fs.readFile(filePath, "utf-8");
  return res.json({content})
})

server.listen(9000, () => console.log(`🐳 Docker is running at port 9000`));
