import Config

if config_env() == :prod do
  config :relay, Relay.Repo,
    url: System.fetch_env!("DATABASE_URL"),
    pool_size: String.to_integer(System.get_env("POOL_SIZE", "10")),
    ssl: true

  config :relay,
    redis_url: System.fetch_env!("REDIS_URL"),
    jwt_secret: System.fetch_env!("JWT_SECRET")

  config :relay, RelayWeb.Endpoint,
    url: [host: System.fetch_env!("RELAY_HOST"), port: 443, scheme: "https"],
    http: [port: String.to_integer(System.get_env("PORT", "4000"))],
    secret_key_base: System.fetch_env!("SECRET_KEY_BASE")
end
