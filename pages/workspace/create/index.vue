// Test outline
// @test e2e: there are three buttons on this screen--blank workspace, from tdei and from file (playwright snapshot this)
// @test e2e: clicking the "from tdei" button takes the user to a form that allows one to set a title and pick a dataset
//            from a project group in the TDEI. The available values should match the simulated API response
// @test e2e: the "from blank workspace" button takes you to a form that allows you to set the title, workspace type and
//            project group, and submitting creates a new workspace and takes you to the dashboard with the new workspace
//            selected (playwright snapshot the form and loading state)
// @test e2e: the "from file" button takes you to a form that allows you to set a title, workspace type, project group, and upload a file,
//            and submitting creates a new workspace and takes you to the dashboard with the new workspace selected (playwright
//            snapshot the form and loading state)
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-container">
    <div class="create-container-header">
      <img
        :src="createIcon"
        class="create-icon"
        alt=""
      >
      <h1 class="create-heading">Create a Workspace</h1>
      <p class="create-sub-heading">Choose how you want to create your workspace. Each option offers different ways to get started.</p>
    </div>
    <div class="row row-cols-1 row-cols-md-3 g-4">
      <div class="col">
        <div class="card create-category">
          <div class="card-body">
            <img
              :src="createBlankIcon"
              class="create-category-icon"
              alt=""
            >
            <div class="card-title">Blank Workspace</div>
            <div class="card-text">Create an empty workspace with no data.</div>
          </div>
          <div class="card-footer">
            <nuxt-link
              to="/workspace/create/blank"
              class="btn btn-primary btn-stretch clr_blank"
            >
              Create Blank Workspace
              <app-icon
                variant="chevron_right"
                no-margin
              />
            </nuxt-link>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card create-category">
          <div class="card-body">
            <img
              :src="createTdeiIcon"
              class="create-category-icon"
              alt=""
            >
            <div class="card-title">From TDEI</div>
            <div class="card-text">
              Create a workspace by importing an asset stored in the TDEI.
            </div>
          </div>
          <div class="card-footer">
            <nuxt-link
              to="/workspace/create/tdei"
              class="btn btn-primary btn-stretch clr_tdei"
            >
              Create From TDEI
              <app-icon
                variant="chevron_right"
                no-margin
              />
            </nuxt-link>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card create-category">
          <div class="card-body">
            <img
              :src="createFileIcon"
              class="create-category-icon"
              alt=""
            >
            <div class="card-title">From File</div>
            <div class="card-text">
              Create a workspace from an OpenSidewalks data file on your computer.
            </div>
          </div>
          <div class="card-footer">
            <nuxt-link
              to="/workspace/create/file"
              class="btn btn-primary btn-stretch clr_file"
            >
              Create From File
              <app-icon
                variant="chevron_right"
                no-margin
              />
            </nuxt-link>
          </div>
        </div>
      </div>
    </div>
  </app-page>
</template>

<script setup lang="ts">
import createIcon from '~/assets/img/create-icon.svg';
import createBlankIcon from '~/assets/img/create_blank.svg';
import createTdeiIcon from '~/assets/img/create_tdei.svg';
import createFileIcon from '~/assets/img/create_file.svg';
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.create-container {
  border: 1px solid $gray-300;
  border-radius: 20px;
  padding: 50px 50px !important;
  width: 80%;
  max-width: 1000px;
  box-shadow: 0px 3px 6px #0000000D;
  margin-top: 50px;
}
.create-container-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 25px;
  .create-heading {
    font-size: 24px;
    font-weight: 600;
    color: $text-navy;
    margin-bottom: -2px;
  }
  .create-sub-heading {
    font-size: 16px;
    color: $text-secondary;
  }
}
.create-icon {
  width: 50px;
}
.create-category {
  box-shadow: 0px 1px 6px #0000000D;
  border: 1px solid #E2E4ED;
  border-radius: 15px;
}
.btn-stretch {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  padding: 8px 12px !important;
}
.create-category-icon {
  width: 50px;
  margin-bottom: 15px;
}
.card-title {
  font-size: 16px;
  font-weight: 700;
  color: $text-navy;
  margin-bottom: 10px;
}
.card-text {
  font-size: 14px;
  color: $text-secondary;
  font-weight: 500;
}
.card-body {
  padding: 20px 15px;
}
.card-footer {
    border-top: 1px dashed #cbcbcd;
    padding: 15px 15px;
    background: none !important;
}
.clr_blank {
  background-color: #7958D2 !important;
  color: #ffffff !important;
  border: none !important;
}
.clr_tdei {
  background-color: #436ECE !important;
  color: #ffffff !important;
  border: none !important;
}
.clr_file {
  background-color: #0D8696 !important;
  color: #ffffff !important;
  border: none !important;
}
@include media-breakpoint-down(md) {
  .create-container {
    border: none;
    box-shadow: none;
    padding: 40px 40px !important;
    margin-top: 0px;
    width: unset;
  }
}
</style>
