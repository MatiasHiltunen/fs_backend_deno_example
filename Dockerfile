FROM denoland/deno:2.9.6

EXPOSE 8000

WORKDIR /app

COPY deno.json deno.lock package.json ./

RUN deno install --frozen

COPY src ./src

RUN deno cache --frozen src/index.ts

USER deno

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "src/index.ts"]

