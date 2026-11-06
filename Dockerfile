FROM alpine:3.20

RUN apk add --no-cache curl jq git \
 && git config --global --add safe.directory /app

WORKDIR /app

# Scripts come from the ./:/app volume (see docker-compose.yml.template)
CMD ["./run-scan.sh"]
