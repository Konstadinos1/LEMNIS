defmodule RelayWeb.UserSocket do
  use Phoenix.Socket

  channel "thread:*", RelayWeb.ThreadChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Relay.Auth.verify_identity_jwt(token) do
      {:ok, identity_id} ->
        {:ok, assign(socket, :identity_id, identity_id)}

      {:error, _} ->
        :error
    end
  end

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.identity_id}"
end
