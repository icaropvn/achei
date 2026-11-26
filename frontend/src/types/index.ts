export const categories = ['Recipientes', 'Mochilas e bolsas', 'Chaves', 'Eletrônicos', 'Roupas', 'Guarda-chuvas', 'Outros'] as const;
export type Category = typeof categories[number];
export type ItemStatus = 'available' | 'returning' | 'returned';
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export interface Institution { id: string; name: string; unit: string; city: string; initials: string; description: string; hours: string; }
export interface Profile { id: string; name: string; role: 'user' | 'staff' | 'admin'; mustChange?: boolean; institutionId?: string; initials: string; }
export interface FoundItem { id: string; institutionId: string; category: Category; summary: string; foundDate: string; location: string; description: string; evidence: string; storage: string; status: ItemStatus; }
export interface Loss { id: string; userId: string; institutionId: string; category: Category; startDate: string; endDate: string; location: string; description: string; active: boolean; }
export interface Claim { id: string; userId: string; itemId: string; lossId?: string; description: string; response: string; status: ClaimStatus; createdAt: string; updatedAt: string; }
export interface Notice { id: string; userId: string; lossId: string; itemId: string; read: boolean; createdAt: string; }
export interface HistoryEvent { id: string; itemId: string; claimId?: string; actor: string; label: string; at: string; }
export interface State { profileId: string | null; institutions: Institution[]; profiles: Profile[]; items: FoundItem[]; losses: Loss[]; claims: Claim[]; notices: Notice[]; history: HistoryEvent[]; }
export type Command =
 | { type: 'profile'; profileId: string | null }
 | { type: 'reset' }
 | { type: 'saveItem'; item: Omit<FoundItem, 'status'>; now: string }
 | { type: 'saveLoss'; loss: Loss; now: string }
 | { type: 'toggleLoss'; id: string; now: string }
 | { type: 'readNotice'; id: string }
 | { type: 'claim'; claim: Claim; now: string }
 | { type: 'decision'; id: string; decision: 'respond' | 'approve' | 'reject' | 'cancel' | 'complete'; response: string; now: string; confirmed?: boolean };
