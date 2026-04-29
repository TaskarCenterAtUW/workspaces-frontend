/** Shape returned by the TDEI project-group-roles API */
export interface TdeiProjectGroupApiResponse {
  tdei_project_group_id: string;
  project_group_name: string;
}

/** Shape returned by the TDEI service API */
export interface TdeiServiceApiResponse {
  tdei_service_id: string;
  service_name: string;
}

/** Shape returned by the TDEI datasets API */
export interface TdeiDatasetApiResponse {
  tdei_dataset_id: string;
  data_type: string;
  status: string;
  project_group: TdeiProjectGroupItem;
  service?: {
    tdei_service_id: string;
    service_name?: string;
  };
  metadata: {
    dataset_detail: {
      name: string;
      version?: string;
      dataset_area?: object;
    };
  };
}

export interface TdeiProjectGroupItem {
  tdei_project_group_id: string;
  name: string;
}

export interface TdeiDatasetItem {
  tdei_dataset_id: string;
  name: string;
}

/** Normalized project group used throughout the UI */
export interface TdeiProjectGroup {
  id: string;
  name: string;
}

/** Normalized service used throughout the UI */
export interface TdeiService {
  id: string;
  name: string;
}

/** Normalized dataset used throughout the UI */
export interface TdeiDatasetSummary {
  id: string;
  name: string;
  version?: string;
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
