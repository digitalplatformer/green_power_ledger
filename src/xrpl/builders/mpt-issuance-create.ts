import type { SubmittableTransaction } from 'xrpl';
import { convertStringToHex } from 'xrpl';

export interface MPTIssuanceCreateParams {
  account: string;
  assetScale?: number;
  maximumAmount?: string;
  transferFee?: number;
  metadata?: string;
}

// CLAUDE.md 仕様: tfMPTCanTransfer と tfMPTCanClawback は必須
const MPT_FLAG_CAN_TRANSFER = 32;  // 0x20
const MPT_FLAG_CAN_CLAWBACK = 64;  // 0x40

/**
 * MPTokenIssuanceCreate トランザクションを構築
 * @param params トランザクションパラメータ
 * @returns MPTokenIssuanceCreate トランザクション
 */
export function buildMPTokenIssuanceCreate(
  params: MPTIssuanceCreateParams
): SubmittableTransaction {
  // CLAUDE.md 仕様: tfMPTCanTransfer と tfMPTCanClawback は必須
  const flags = MPT_FLAG_CAN_TRANSFER | MPT_FLAG_CAN_CLAWBACK; // 96

  const tx: any = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: params.account,
    Flags: flags
  };

  if (params.assetScale !== undefined) {
    tx.AssetScale = params.assetScale;
  }

  if (params.maximumAmount) {
    tx.MaximumAmount = params.maximumAmount;
  }

  if (params.transferFee !== undefined) {
    tx.TransferFee = params.transferFee;
  }

  if (params.metadata) {
    tx.MPTokenMetadata = convertStringToHex(params.metadata);
  }

  return tx as SubmittableTransaction;
}
