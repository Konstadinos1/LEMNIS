defmodule Relay.MixProject do
  use Mix.Project

  def project do
    [
      app: :relay,
      version: "0.1.0",
      elixir: "~> 1.16",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps()
    ]
  end

  def application do
    [
      mod: {Relay.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:phoenix, "~> 1.7"},
      {:phoenix_pubsub, "~> 2.1"},
      {:ecto_sql, "~> 3.11"},
      {:postgrex, "~> 0.17"},
      {:jason, "~> 1.4"},
      {:plug_cowboy, "~> 2.7"},
      {:corsica, "~> 2.1"},
      {:redix, "~> 1.5"},
      {:hammer, "~> 7.0"},
      {:telemetry_metrics, "~> 1.0"},
      {:telemetry_poller, "~> 1.1"},
      {:opentelemetry_exporter, "~> 1.7"},
      {:opentelemetry_phoenix, "~> 2.0"},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      "ecto.setup": ["ecto.create", "ecto.migrate"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"]
    ]
  end
end
