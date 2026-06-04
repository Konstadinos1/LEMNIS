defmodule RelayWeb.ThreadChannel do
  use Phoenix.Channel

  alias Relay.{Repo, MessageEnvelope, RateLimiter}

  @max_envelope_bytes 65_536
  @offline_ttl_seconds 7 * 24 * 60 * 60

  @doc """
  Join a thread channel. The relay authenticates the messaging identity
  (Signal identity key fingerprint) but never receives wallet addresses.
  The topic `thread:<id>` contains no user-identifying information beyond
  what routing requires.
  """
  def join("thread:" <> thread_id, %{"token" => token}, socket) do
    case verify_identity_token(token) do
      {:ok, identity_id} ->
        socket = assign(socket, :identity_id, identity_id)
        socket = assign(socket, :thread_id, thread_id)
        send(self(), :deliver_offline)
        {:ok, socket}

      {:error, reason} ->
        {:error, %{reason: reason}}
    end
  end

  def join(_, _, _socket), do: {:error, %{reason: "invalid_topic"}}

  @doc """
  Receive an encrypted envelope from the client and fan it out to other
  participants. The relay sees only ciphertext — never plaintext.
  """
  def handle_in("send_message", %{"envelope" => envelope, "session_id" => session_id}, socket)
      when is_binary(envelope) and byte_size(envelope) <= @max_envelope_bytes do
    with :ok <- RateLimiter.check(socket.assigns.identity_id) do
      payload = %{
        "envelope" => envelope,
        "session_id" => session_id,
        "sender_id" => socket.assigns.identity_id
      }

      # Fan out to all connected participants in the thread
      broadcast!(socket, "new_message", payload)

      # Persist for offline delivery (TTL'd ciphertext only)
      store_for_offline(socket.assigns.thread_id, payload)

      {:reply, :ok, socket}
    else
      {:error, :rate_limited} -> {:reply, {:error, %{reason: "rate_limited"}}, socket}
    end
  end

  def handle_in("send_message", _params, socket) do
    {:reply, {:error, %{reason: "envelope_too_large"}}, socket}
  end

  # Deliver any envelopes that arrived while the client was offline.
  def handle_info(:deliver_offline, socket) do
    envelopes = fetch_offline(socket.assigns.thread_id, socket.assigns.identity_id)
    Enum.each(envelopes, fn env -> push(socket, "new_message", env) end)
    {:noreply, socket}
  end

  defp verify_identity_token(token) do
    # Verify a JWT signed with the client's Ed25519 identity key.
    # Implementation delegates to Relay.Auth.verify_identity_jwt/1.
    Relay.Auth.verify_identity_jwt(token)
  end

  defp store_for_offline(thread_id, payload) do
    Redix.command(:redix, [
      "LPUSH",
      "offline:#{thread_id}",
      Jason.encode!(payload)
    ])

    Redix.command(:redix, ["EXPIRE", "offline:#{thread_id}", @offline_ttl_seconds])
  end

  defp fetch_offline(thread_id, _identity_id) do
    case Redix.command(:redix, ["LRANGE", "offline:#{thread_id}", 0, 499]) do
      {:ok, items} ->
        Enum.map(items, &Jason.decode!/1)

      _ ->
        []
    end
  end
end
