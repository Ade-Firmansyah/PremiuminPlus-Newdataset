export type PremiuminRole = 'admin' | 'reseller' | 'member';

export interface FinalProductPrice {
  base_price: number;
  member_price: number;
  reseller_price: number;
}
