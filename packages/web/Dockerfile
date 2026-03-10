FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o web .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/web ./web
COPY --from=build /app/templates ./templates

ENV PORT=8080
EXPOSE 8080
CMD ["./web"]
