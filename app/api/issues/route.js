import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const stateFilePath = path.join(process.cwd(), '.opencontri-state', 'issue-state.json');

function normalizeRepoInput(input) {
  const cleaned = String(input || '').trim().replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/+$/, '');

  if (!cleaned) {
    return null;
  }

  const match = cleaned.replace(/^github\.com\//i, '').match(/^([^/]+)\/([^/]+)(?:\/.*)?$/i);
  if (!match) {
    return null;
  }

  const owner = match[1].toLowerCase();
  const repo = match[2].toLowerCase();

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}

async function readState() {
  try {
    const contents = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(contents);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    return {};
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));
}

async function githubRequest(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'OpenContri/1.0.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers, cache: 'no-store' });

  if (!response.ok) {
    let message = 'GitHub API request failed';

    try {
      const errorBody = await response.json();
      if (errorBody?.message) {
        message = errorBody.message;
      }
    } catch {
      // Ignore malformed error payloads.
    }

    return {
      ok: false,
      status: response.status,
      message,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: await response.json(),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get('repo');

  if (!repoParam) {
    return NextResponse.json({ error: 'Provide a repo query parameter.' }, { status: 400 });
  }

  const repoInfo = normalizeRepoInput(repoParam);

  if (!repoInfo) {
    return NextResponse.json({ error: 'Repository must be in owner/repo format.' }, { status: 400 });
  }

  const repoResponse = await githubRequest(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`);

  if (!repoResponse.ok) {
    return NextResponse.json({ error: repoResponse.message }, { status: repoResponse.status >= 400 && repoResponse.status < 500 ? repoResponse.status : 502 });
  }

  const issuesResponse = await githubRequest(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues?state=open&per_page=100`);

  if (!issuesResponse.ok) {
    return NextResponse.json({ error: issuesResponse.message }, { status: issuesResponse.status >= 400 && issuesResponse.status < 500 ? issuesResponse.status : 502 });
  }

  const repo = repoResponse.data;
  const currentOpenIssues = (issuesResponse.data || [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      url: issue.html_url,
      created_at: issue.created_at,
      author: issue.user?.login || 'unknown',
      labels: (issue.labels || []).map((label) => label.name),
      comments: issue.comments || 0,
      repo: repo.full_name,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));


// found some issues in the production so I am commenting out if you are seeing this means you have issue in localhost so remove the comment of following lines of code 


//   const storedState = await readState();
//   const knownIssues = Array.isArray(storedState[repo.full_name]) ? storedState[repo.full_name] : [];
//   const newIssues = currentOpenIssues.filter((issue) => !knownIssues.includes(issue.number));

//   storedState[repo.full_name] = currentOpenIssues.map((issue) => issue.number);
//   await writeState(storedState);

const newIssues = [];

  return NextResponse.json({
    repo: {
      full_name: repo.full_name,
      description: repo.description,
      stargazers_count: repo.stargazers_count,
      owner: {
        login: repo.owner?.login || repoInfo.owner,
      },
      private: repo.private,
      html_url: repo.html_url,
    },
    issues: currentOpenIssues,
    notifications: newIssues,
    last_updated: new Date().toISOString(),
  });
}
