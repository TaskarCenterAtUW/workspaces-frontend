<template>
  <app-page>
    <div class="text-center mt-5">
      <app-icon
        variant="help"
        size="48"
        no-margin
      />
    </div>
    <h1 class="mb-5 text-center">
      Help &amp; Support
    </h1>

    <b-row>
      <b-col
        md="6"
        xl="5"
        xxl="4"
        class="mb-3"
        offset-xl="1"
        offset-xxl="2"
      >
        <b-card>
          <template #header>
            <h2 class="h5 mb-0">
              <app-icon
                variant="menu_book"
                size="24"
              />
              Documentation
            </h2>
          </template>

          <p>
            Step-by-step guides for creating and managing workspaces, editing,
            exporting data, and more.
          </p>

          <b-button
            href="https://taskarcenteratuw.github.io/tcat-wiki/workspaces/"
            target="_blank"
            variant="primary"
          >
            Open Workspaces Guides
            <app-icon
              variant="open_in_new"
              size="18"
              class="ms-1"
            />
          </b-button>
        </b-card>
      </b-col>

      <b-col
        md="6"
        xl="5"
        xxl="4"
        class="mb-3"
      >
        <b-card>
          <template #header>
            <h2 class="h5 mb-0">
              <app-icon
                variant="mail"
                size="24"
              />
              Contact Support
            </h2>
          </template>

          <p>Have a question or need help? Reach out to the TDEI helpdesk.</p>

          <b-button
            href="mailto:helpdesk@tdei.us"
            variant="outline-primary"
          >
            helpdesk@tdei.us
          </b-button>
        </b-card>
      </b-col>
    </b-row>
  </app-page>
</template>
