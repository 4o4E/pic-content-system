const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("数据库测试必须显式设置 TEST_DATABASE_URL，避免误用本地开发数据库");
}

if (!/(_test|test)/i.test(testDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL 必须指向名称包含 test 的数据库");
}

process.env.DATABASE_URL = testDatabaseUrl;
