export const leadStageLabels = {
  new: 'جدید',
  contacted: 'تماس گرفته شده',
  negotiating: 'در حال مذاکره',
  won: 'همکاری آغاز شد',
  lost: 'همکاری منتفی شد',
} as const;
export type LeadStage = keyof typeof leadStageLabels;

export type PartnerLead = {
  id: string;
  message_id: string | null;
  cafe_name: string;
  contact_name: string;
  contact: string;
  stage: LeadStage;
  follow_up_on: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type PartnerLeadList = { leads: PartnerLead[]; page: number; pages: number; total: number };
export type PartnerLeadDetail = {
  lead: PartnerLead;
  application: string | null;
  notes: { id: number; author: string; body: string; created_at: string }[];
};
