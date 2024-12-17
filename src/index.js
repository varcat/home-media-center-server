import fastify from "fastify";
import routes from "./routes/index.js";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local" });

const server = fastify();

server.setErrorHandler((error, request, reply) => {
  if (Array.isArray(error.validation)) {
    reply.status(200).send({
      ok: false,
      msg: error.validation,
    });
    return;
  }

  reply.status(500).send({
    ok: false,
    msg: error.message,
    stack: error.stack,
  });
});

server.register(routes);

server.listen({ port: 3000 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
