import Config

config :relay, Relay.Repo,
  username: System.get_env("POSTGRES_USER", "postgres"),
  password: System.get_env("POSTGRES_PASSWORD", "postgres"),
  hostname: System.get_env("POSTGRES_HOST", "localhost"),
  database: "relay_test",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 5

config :relay,
  redis_url: System.get_env("REDIS_URL", "redis://localhost:6379"),
  jwt_secret: "test_secret"

config :relay, RelayWeb.Endpoint,
  http: [port: 4001],
  secret_key_base: String.duplicate("test_secret_base_32_chars_minimum_", 2),
  server: false

config :logger, level: :warning
