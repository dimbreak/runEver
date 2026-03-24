import path from 'path';
import dotenv from 'dotenv';
import { benchmarkApis, benchmarkCases } from './config';
import { renderReportSummary, runBenchmark } from './runner';

dotenv.config({
  path: path.resolve(process.cwd(), 'runEverMark/benchmark/.env'),
});

const parseArgs = (argv: string[]) => {
  const args = {
    apiIds: [] as string[],
    repeats: undefined as number | undefined,
    listOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--list') {
      args.listOnly = true;
      continue;
    }
    if (current === '--api') {
      const next = argv[index + 1];
      if (next) {
        args.apiIds.push(next);
        index += 1;
      }
      continue;
    }
    if (current === '--repeats') {
      const next = Number(argv[index + 1]);
      if (!Number.isNaN(next) && next > 0) {
        args.repeats = next;
        index += 1;
      }
    }
  }

  return args;
};

const listConfig = () => {
  console.log('Available APIs:');
  benchmarkApis.forEach((api) => {
    console.log(`- ${api.id} (${api.provider})`);
  });
  console.log('Available cases:');
  benchmarkCases.forEach((benchmarkCase) => {
    console.log(`- ${benchmarkCase.id} (${benchmarkCase.name})`);
  });
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.listOnly) {
    listConfig();
    process.exit(0);
  }

  const report = await runBenchmark({
    apiIds: args.apiIds.length > 0 ? args.apiIds : undefined,
    repeats: args.repeats,
  });

  console.log(renderReportSummary(report));
  process.exit(report.summaries.length > 0 ? 0 : 1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
