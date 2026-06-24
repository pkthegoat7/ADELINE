export type ReservationPaymentStatus = 'pending' | 'partial' | 'paid';

/** Deriva o status de pagamento da reserva a partir do total já pago. */
export function computePaymentStatus(totalPaid: number, totalAmount: number): ReservationPaymentStatus {
  if (totalPaid >= totalAmount) return 'paid';
  if (totalPaid > 0) return 'partial';
  return 'pending';
}
