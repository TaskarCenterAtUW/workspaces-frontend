export type TdeiRoleAssignment = string;

export interface TdeiProjectGroupItem {
  tdei_project_group_id: string;
  name: string;
}

export interface TdeiProjectGroup extends TdeiProjectGroupItem {
  roles: TdeiRoleAssignment[];
}

export interface TdeiDatasetItem {
  tdei_dataset_id: string;
  name: string;
}

export interface TdeiUserItem {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  phone: string;
  roles: TdeiRoleAssignment[];
}

export interface TdeiFeedback {
  id: number;
  status: string;
  location_latitude: number;
  location_longitude: number;
  customer_email: string;
  feedback_text: string;
  created_at: Date;
  updated_at: Date;
  due_date: Date;
  resolution_status: string | null;
  resolution_description: string | null;
  resolved_by: string | null;
  project_group: TdeiProjectGroupItem;
  dataset: TdeiDatasetItem;
}
