export type MessageType = 'text' | 'swap_receipt' | 'tx_pill' | 'image' | 'system';

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface BaseMessage {
  id: string;
  threadId: string;
  senderId: string;
  timestamp: number;
  type: MessageType;
  /** Ciphertext blob; plaintext is decrypted client-side and never stored in plaintext. */
  ciphertext: string;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  plaintext: string;
}

export interface SwapReceiptMessage extends BaseMessage {
  type: 'swap_receipt';
  receipt: SwapReceipt;
}

export interface TxPillMessage extends BaseMessage {
  type: 'tx_pill';
  txHash: string;
  status: TxStatus;
  chainId: number;
}

export interface SwapReceipt {
  txHash: string;
  fromToken: TokenRef;
  toToken: TokenRef;
  fromAmount: string;
  toAmount: string;
  chainId: number;
  timestamp: number;
  status: TxStatus;
}

export interface TokenRef {
  address: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
}

export type Message =
  | TextMessage
  | SwapReceiptMessage
  | TxPillMessage;

export interface Thread {
  id: string;
  participants: string[];
  /** Relay identity fingerprints (hex Ed25519 pubkey) for each participant.
   *  Populated when threads are created via X3DH; used to dispatch push notifications. */
  participantFingerprints?: string[];
  lastMessage?: Message;
  unreadCount: number;
  /** AES-GCM sender key for this thread — held in-memory only, never persisted plaintext. */
  senderKeyHandle?: string;
}
