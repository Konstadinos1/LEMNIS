import Config

config :relay, Relay.Repo,
  username: System.get_env("POSTGRES_USER", "postgres"),
  password: System.get_env("POSTGRES_PASSWORD", "postgres"),
  hostname: System.get_env("POSTGRES_HOST", "localhost"),
  database: "relay_dev",
  pool_size: 5,
  show_sensitive_data_on_connection_error: true

config :relay,
  redis_url: System.get_env("REDIS_URL", "redis://localhost:6379"),
  jwt_secret: System.get_env("JWT_SECRET", "dev_secret_change_me")

config :relay, RelayWeb.Endpoint,
  http: [port: 4000],
  secret_key_base: String.duplicate("dev_secret_base_change_me_in_prod", 2),
  check_origin: false,
  code_reloader: false,
  debug_errors: true,
  watchers: []

config :logger, level: :debug
