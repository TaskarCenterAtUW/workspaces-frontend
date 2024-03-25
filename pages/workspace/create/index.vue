<template>
  <app-page>
    <div class="text-center mt-5">
      <app-icon variant="add_to_queue" size="48" />
    </div>
    <h1 class="mb-5 text-center">Create a Workspace</h1>

    <div class="row row-cols-1 row-cols-md-3 g-4">
      <div class="col">
        <div class="card">
          <div class="card-body">
            <app-icon variant="create_new_folder" size="36" class="mb-2" />
            <h5 class="card-title">Blank Workspace</h5>
            <p class="card-text">Create an empty workspace with no data.</p>
          </div>
          <div class="card-footer">
            <nuxt-link to="/workspace/create/blank" class="btn btn-primary">
              Start
              <app-icon variant="arrow_circle_right" no-margin />
            </nuxt-link>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-body">
            <app-icon variant="cloud_sync" size="36" class="mb-2" />
            <h5 class="card-title">From TDEI</h5>
            <p class="card-text">
              Create a workspace by importing an asset stored in the TDEI.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link to="/workspace/create/tdei" class="btn btn-primary">
              Start
              <app-icon variant="arrow_circle_right" no-margin />
            </nuxt-link>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-body">
            <app-icon variant="upload_file" size="36" class="mb-2" />
            <h5 class="card-title">From File</h5>
            <p class="card-text">
              Create a workspace from an OpenSidewalks data file on your computer.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link to="/workspace/create/file" class="btn btn-primary">
              Start
              <app-icon variant="arrow_circle_right" no-margin />
            </nuxt-link>
          </div>
        </div>
      </div>
    </div>
  </app-page>
</template>
