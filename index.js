const core = require('@actions/core')
const github = require('@actions/github')
const { stringify } = require('csv-stringify/sync')
const { orderBy } = require('natural-orderby')

const token = core.getInput('token', { required: true })
const octokit = github.getOctokit(token)
const eventPayload = require(process.env.GITHUB_EVENT_PATH)
const { owner, repo } = github.context.repo
const enterprise = core.getInput('enterprise', { required: false }) || eventPayload.enterprise.slug

const sortColumn = core.getInput('sort', { required: false }) || 'login'
const sortOrder = core.getInput('sort-order', { required: false }) || 'asc'
const committerName = core.getInput('committer-name', { required: false }) || 'github-actions'
const committerEmail = core.getInput('committer-email', { required: false }) || 'github-actions@github.com'
const jsonExport = core.getInput('json', { required: false }) || 'false'

// Orchestrator
;(async () => {
  try {
    const orgArray = []
    await orgNames(orgArray)
    await orgMembers(orgArray)
  } catch (error) {
    core.setFailed(error.message)
  }
})()

// Query all enterprise org names
async function orgNames(orgArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($enterprise: String!, $cursorID: String) {
        enterprise(slug: $enterprise) {
          organizations(first: 100, after: $cursorID) {
            nodes {
              login
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        enterprise: enterprise,
        cursorID: endCursor
      })

      const entOrgs = dataJSON.enterprise.organizations.nodes.map((entOrg) => entOrg.login)

      hasNextPage = dataJSON.enterprise.organizations.pageInfo.hasNextPage

      for (const entOrg of entOrgs) {
        if (hasNextPage) {
          endCursor = dataJSON.enterprise.organizations.pageInfo.endCursor
        } else {
          endCursor = null
        }
        orgArray.push(entOrg)
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all organization members
async function orgMembers(orgArray) {
  for (const org of orgArray) {
    try {
      const members = []
      let endCursor = null
      const query = /* GraphQL */ `
        query ($owner: String!, $cursorID: String) {
          organization(login: $owner) {
            membersWithRole(first: 100, after: $cursorID) {
              edges {
                cursor
                node {
                  login
                  name
                  email
                  organizationVerifiedDomainEmails(login: $owner)
                  createdAt
                  updatedAt
                  location
                }
                role
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `

      let hasNextPage = false
      let dataJSON = null

      do {
        dataJSON = await octokit.graphql({
          query,
          owner: org,
          cursorID: endCursor
        })

        const orgMembers = dataJSON.organization.membersWithRole.edges.map((orgMember) => ({
          login: orgMember.node.login,
          name: orgMember.node.name,
          role: orgMember.role === 'ADMIN' ? 'Org Owner' : 'Member',
          email: orgMember.node.email,
          verifiedEmail: orgMember.node.organizationVerifiedDomainEmails ? orgMember.node.organizationVerifiedDomainEmails.join(', ') : null,
          createdAt: orgMember.node.createdAt,
          updatedAt: orgMember.node.updatedAt,
          location: orgMember.node.location
        }))

        hasNextPage = dataJSON.organization.membersWithRole.pageInfo.hasNextPage

        for (const orgMember of orgMembers) {
          if (hasNextPage) {
            endCursor = dataJSON.organization.membersWithRole.pageInfo.endCursor
          } else {
            endCursor = null
          }
          orgMember.createdAt = orgMember.createdAt.slice(0, 10)
          orgMember.updatedAt = orgMember.updatedAt.slice(0, 10)

          members.push(orgMember)
        }
      } while (hasNextPage)
      await ssoCheck(org, members)
      await orgCollabs(org, members)
    } catch (error) {
      core.setFailed(error.message)
    }
  }

  // Check if the organization has SSO enabled
  async function ssoCheck(org, members) {
    try {
      const query = /* GraphQL */ `
        query ($org: String!) {
          organization(login: $org) {
            samlIdentityProvider {
              id
            }
          }
        }
      `

      dataJSON = await octokit.graphql({
        query,
        org: org
      })

      if (dataJSON.organization.samlIdentityProvider) {
        await ssoEmail(org, members)
      } else {
        // do nothing
      }
    } catch (error) {
      core.setFailed(error.message)
    }
  }
}

// Retrieve all members of a SSO enabled organization
async function ssoEmail(org, members) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($org: String!, $cursorID: String) {
        organization(login: $org) {
          samlIdentityProvider {
            externalIdentities(first: 100, after: $cursorID) {
              totalCount
              edges {
                node {
                  samlIdentity {
                    nameId
                  }
                  user {
                    login
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: endCursor
      })

      const emails = dataJSON.organization.samlIdentityProvider.externalIdentities.edges

      hasNextPage = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.endCursor
        } else {
          endCursor = null
        }

        if (!email.node.user) continue
        const login = email.node.user.login

        if (members.some((member) => member.login === login)) {
          const index = members.findIndex((member) => member.login === login)
          members[index].ssoEmail = email.node.samlIdentity.nameId
        }
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all outside collaborators for an org
async function orgCollabs(org, members) {
  try {
    const data = await octokit.paginate(octokit.rest.orgs.listOutsideCollaborators, {
      org: org
    })

    const collabs = data.map((collab) => ({ login: collab.login, role: 'Outside Collaborator' }))

    for (const collab of collabs) {
      const data = await octokit.rest.users.getByUsername({
        username: collab.login
      })
      collab.name = data.data.name
      collab.email = data.data.email
      collab.createdAt = data.data.created_at.slice(0, 10)
      collab.updatedAt = data.data.updated_at.slice(0, 10)
      collab.location = data.data.location
    }

    members.push(...collabs)

    await pushCSV(members, org)
  } catch (error) {
    core.warning(error.message + ' ' + org)
  }
}

// Generate and push CSV report
async function pushCSV(members, org) {
  try {
    const columns = {
      login: 'Login',
      name: 'Name',
      role: 'Role',
      email: 'Public email',
      verifiedEmail: 'Verified email',
      ssoEmail: 'SSO email',
      createdAt: 'Account created',
      updatedAt: 'Account last updated',
      location: 'Location'
    }

    const sortArray = orderBy(members, [sortColumn], [sortOrder])
    const csv = stringify(sortArray, {
      header: true,
      columns: columns
    })

    const reportPath = `reports/${org}.csv`
    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${new Date().toISOString().slice(0, 10)} User totals report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    console.log(`Pushing ${org} report to ${owner}/${repo}/${reportPath}`)

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: reportPath
      })

      if (data && data.sha) {
        opts.sha = data.sha
      }
    } catch (err) {}

    await octokit.rest.repos.createOrUpdateFileContents(opts)
    if (jsonExport === 'true') {
      await pushJSON(org, members)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Generate and push optional JSON report
async function pushJSON(org, members) {
  try {
    const reportPath = `reports/${org}.json`
    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${new Date().toISOString().slice(0, 10)} User totals report`,
      content: Buffer.from(JSON.stringify(members, null, 2)).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: reportPath
      })

      if (data && data.sha) {
        opts.sha = data.sha
      }
    } catch (err) {}

    await octokit.rest.repos.createOrUpdateFileContents(opts)
  } catch (error) {
    core.setFailed(error.message)
  }
}
