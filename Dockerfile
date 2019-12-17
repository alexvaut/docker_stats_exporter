FROM stefanscherer/node-windows:10.15

WORKDIR /app

COPY package*.json /app/
RUN npm ci

COPY docker_stats_exporter.js /app/

EXPOSE 9487
ENV DOCKERSTATS_PORT=9487 DOCKERSTATS_INTERVAL=15 DEBUG=0 DOCKERSTATS_HOSTIP=http://host.docker.internal DOCKERSTATS_HOSTPORT=2375

COPY entrypoint.bat /app/
CMD ["entrypoint.bat"]