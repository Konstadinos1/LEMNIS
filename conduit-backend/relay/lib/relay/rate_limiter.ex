defmodule Relay.RateLimiter do
  @doc """
  Allow 60 messages per minute per identity.
  Backed by Hammer with a Redis backend for horizontal scalability.
  """
  def check(identity_id) do
    case Hammer.check_rate("msg:#{identity_id}", 60_000, 60) do
      {:allow, _count} -> :ok
      {:deny, _limit} -> {:error, :rate_limited}
    end
  end
end
