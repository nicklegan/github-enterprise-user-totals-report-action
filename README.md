# GitHub Enterprise User Totals Report Action

> An Action to generate reports per organization which contain the total number of owners, members and outside collaborators part of a GitHub Enterprise Cloud instance.

## Usage

The example [workflow](https://docs.github.com/actions/reference/workflow-syntax-for-github-actions) below runs on a weekly [schedule](https://docs.github.com/actions/reference/events-that-trigger-workflows#scheduled-events) and can also be executed manually using a [workflow_dispatch](https://docs.github.com/actions/reference/events-that-trigger-workflows#manual-events) event.

```yml
name: Enterprise User Totals Report

on:
  schedule:
    # Runs on the first day of the week at 00:00 UTC
    #
    #        ┌────────────── minute
    #        │ ┌──────────── hour
    #        │ │ ┌────────── day (month)
    #        │ │ │ ┌──────── month
    #        │ │ │ │ ┌────── day (week)
    - cron: '0 0 * * 0'
  workflow_dispatch:

jobs:
  user-totals-report:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Retrieve user totals report
        uses: nicklegan/github-enterprise-user-totals-report-action@v1.0.0
        with:
          token: ${{ secrets.ENT_TOKEN }}
        # enterprise: ''
        # sort: 'login'
        # sort-order: 'asc'
        # json: 'false'
```

## GitHub secrets

| Name                 | Value                                                                                 | Required |
| :------------------- | :------------------------------------------------------------------------------------ | :------- |
| `ENT_TOKEN`          | A `read:enterprise`, `admin:org`, `repo`, `user:email` scoped [Personal Access Token] | `true`   |
| `ACTIONS_STEP_DEBUG` | `true` [Enables diagnostic logging]                                                   | `false`  |

[personal access token]: https://github.com/settings/tokens/new?scopes=repo,read:enterprise,admin:org,user:email&description=User+Totals+Action 'Personal Access Token'
[enables diagnostic logging]: https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging 'Enabling runner diagnostic logging'

:bulb: Make sure the user generating the token has both the enterprise administrator role and organization owner roles for the organizations the report is generated for.

:bulb: Disable [token expiration](https://docs.github.com/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to avoid failed workflow runs when running on a schedule.

:bulb: If the organizations have SAML SSO enabled make sure the personal access token is [authorized](https://docs.github.com/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on) to access the organizations.

## Action inputs

| Name              | Description                                                                                                                         | Default                     | Location       | Required |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- | :------------- | :------- |
| `enterprise`      | GitHub enterprise different than workflow context                                                                                   |                             | [workflow.yml] | `false`  |
| `sort`            | CSV column used to sort report: `login`, `name`, `role`, `email`, `verifiedEmail`, `ssoEmail`, `createdAt`, `updatedAt`, `location` | `login`                     | [workflow.yml] | `false`  |
| `sort-order`      | CSV column sort order: `asc` or `desc`                                                                                              | `asc`                       | [workflow.yml] | `false`  |
| `json`            | Setting to generate an additional report in JSON format                                                                             | `false`                     | [workflow.yml] | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history                                                                       | `github-actions`            | [action.yml]   | `false`  |
| `committer-email` | The committer email that will appear in the Git history                                                                             | `github-actions@github.com` | [action.yml]   | `false`  |

[workflow.yml]: #Usage 'Usage'
[action.yml]: action.yml 'action.yml'

## CSV/JSON layout

| Column                 | JSON            | Description                                  |
| :--------------------- | :-------------- | :------------------------------------------- |
| `Login`                | `login`         | GitHub username                              |
| `Name`                 | `name`          | GitHub profile name                          |
| `Role`                 | `role`          | Org Owner, Member or Outside Collaborator    |
| `Public email`         | `email`         | GitHub public account email                  |
| `Verified email`       | `verifiedEmail` | GitHub verified domain email                 |
| `SSO email`            | `ssoEmail`      | GitHub linked NameID email                   |
| `Account created`      | `createdAt`     | The date the user account was created        |
| `Account last updated` | `updatedAt`     | The date the user settings were last updated |
| `Location`             | `location`      | Place of residence                           |

A CSV report file will be saved in the repository **reports** folder using the naming of the exporting organization.
