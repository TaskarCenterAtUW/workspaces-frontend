export type TdeiRoleAssignment = string;

//
// Dataset metadata schema
// https://raw.githubusercontent.com/TaskarCenterAtUW/TDEI-osw-datasvc-ts/master/schema/metadata.schema.json
//

export interface TdeiDatasetMetadataDatasetDetail {
  name: string;
  version: string;
  collected_by: string;
  collection_date: string;
  data_source: '3rdParty' | 'TDEITools' | 'InHouse';
  schema_version: string;
  description?: string | null;
  custom_metadata?: Record<string, unknown> | null;
  valid_from?: string | null;
  valid_to?: string | null;
  collection_method?: 'manual' | 'transform' | 'generated' | 'AV' | 'others' | null;
  dataset_area?: object | null;
}

export interface TdeiDatasetMetadataDataProvenance {
  full_dataset_name: string;
  other_published_locations?: string | null;
  dataset_update_frequency_months?: number | null;
  schema_validation_run?: boolean | null;
  schema_validation_run_description?: string | null;
  allow_crowd_contributions?: boolean | null;
  location_inaccuracy_factors?: string | null;
}

export interface TdeiDatasetMetadataDatasetSummary {
  collection_name?: string | null;
  department_name?: string | null;
  city?: string | null;
  region?: string | null;
  county?: string | null;
  key_limitations?: string | null;
  release_notes?: string | null;
  challenges?: string | null;
}

export interface TdeiDatasetMetadataMaintenance {
  official_maintainer?: string[] | null;
  last_updated?: string | null;
  update_frequency?: string | null;
  authorization_chain?: string | null;
  maintenance_funded?: boolean | null;
  funding_details?: string | null;
}

export interface TdeiDatasetMetadataMethodology {
  point_data_collection_device?: string | null;
  node_locations_and_attributes_editing_software?: string | null;
  data_collected_by_people?: boolean | null;
  data_collectors?: string | null;
  data_captured_automatically?: boolean | null;
  automated_collection?: string | null;
  data_collectors_organization?: string | null;
  data_collector_compensation?: string | null;
  preprocessing_location?: string | null;
  preprocessing_by?: string | null;
  preprocessing_steps?: string | null;
  data_collection_preprocessing_documentation?: boolean | null;
  documentation_uri?: string | null;
  validation_process_exists?: boolean | null;
  validation_process_description?: string | null;
  validation_conducted_by?: string | null;
  excluded_data?: string | null;
  excluded_data_reason?: string | null;
}

/** Full upload metadata envelope sent to the TDEI API. */
export interface TdeiDatasetMetadata {
  dataset_detail: TdeiDatasetMetadataDatasetDetail;
  data_provenance?: TdeiDatasetMetadataDataProvenance;
  dataset_summary?: TdeiDatasetMetadataDatasetSummary;
  maintenance?: TdeiDatasetMetadataMaintenance;
  methodology?: TdeiDatasetMetadataMethodology;
}


/** Shape returned by the TDEI project-group-roles API */
export interface TdeiProjectGroupApiResponse {
  tdei_project_group_id: string;
  project_group_name: string;
  roles?: string[];
}

export interface TdeiProjectGroupItem {
  tdei_project_group_id: string;
  name: string;
}

export interface TdeiProjectGroup extends TdeiProjectGroupItem {
  roles: TdeiRoleAssignment[];
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
  metadata: TdeiDatasetMetadata;
}

export interface TdeiDatasetItem {
  tdei_dataset_id: string;
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
