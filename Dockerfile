FROM denoland/deno:2.9.8

EXPOSE 8000

WORKDIR /app

COPY main.ts deno.json deno.lock ./

RUN deno install

RUN deno cache main.ts

USER deno

CMD ["run", "--allow-net", "main.ts"]

