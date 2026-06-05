defmodule RelayWeb.Router do
  use Phoenix.Router, helpers: false

  pipeline :internal do
    plug :accepts, ["json"]
    plug :require_internal_origin
  end

  scope "/internal", RelayWeb do
    pipe_through :internal

    post "/prekeys/register", InternalPrekeysController, :register
    get "/prekeys/:fingerprint", InternalPrekeysController, :fetch_bundle
  end

  # Allow requests only from loopback and RFC-1918 private ranges.
  # The API gateway (Node) runs as a sibling container on the same Docker network.
  defp require_internal_origin(conn, _opts) do
    if internal_ip?(conn.remote_ip) do
      conn
    else
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.send_resp(403, ~s({"error":"forbidden"}))
      |> Plug.Conn.halt()
    end
  end

  defp internal_ip?({127, _, _, _}), do: true
  defp internal_ip?({10, _, _, _}), do: true
  defp internal_ip?({172, b, _, _}) when b in 16..31, do: true
  defp internal_ip?({192, 168, _, _}), do: true
  defp internal_ip?(_), do: false
end
