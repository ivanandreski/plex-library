FROM php:8-cli

WORKDIR /app

# Install git
RUN apt-get update && apt-get install -y git

# Mark the project as a safe directory for Git inside the container
RUN git config --global --add safe.directory /app

COPY cli.php .
COPY run-scan.sh .

RUN chmod +x /app/run-scan.sh

CMD ["./run-scan.sh"]
