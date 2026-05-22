import type { MediaElement } from "@pic/shared";
import { describe, expect, it, vi } from "vitest";
import { toSourceBindingDto, writeSourceBinding } from "./source-service.js";

function imageElement(id = "a".repeat(32)): MediaElement {
  return { type: "image", id, format: "png", file: false, width: 1, height: 1 };
}

describe("source-service", () => {
  it("SourceBinding 转 DTO 时去掉 null 字段", () => {
    const dto = toSourceBindingDto({
      id: "source-id",
      contentId: "content-id",
      platform: "import",
      platformMessageId: null,
      platformGroupId: null,
      platformUserId: "user",
      platformFileId: null,
      sourceKey: "key",
      sourceIndex: 1,
      raw: { ok: true },
      createdAt: new Date(),
    });

    expect(dto).toMatchObject({
      id: "source-id",
      platform: "import",
      userId: "user",
      sourceKey: "key",
      sourceIndex: 1,
      raw: { ok: true },
    });
    expect(dto.messageId).toBeUndefined();
  });

  it("没有来源平台时不写入", async () => {
    const tx = { sourceBinding: { findFirst: vi.fn() } };

    await expect(writeSourceBinding(tx as never, "content-id", [], undefined)).resolves.toBeUndefined();
    expect(tx.sourceBinding.findFirst).not.toHaveBeenCalled();
  });

  it("导入来源默认用文件 md5 生成消息和文件标识", async () => {
    const create = vi.fn().mockResolvedValue({ id: "source-id" });
    const tx = {
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        create,
      },
    };

    await writeSourceBinding(tx as never, "content-id", [imageElement()], { platform: "import" });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentId: "content-id",
        platform: "import",
        platformMessageId: `import:${"a".repeat(32)}`,
        platformFileId: "a".repeat(32),
        sourceKey: "a".repeat(32),
      }),
    });
  });

  it("已有来源绑定时更新而不是新建", async () => {
    const update = vi.fn().mockResolvedValue({ id: "source-id" });
    const tx = {
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-id" }),
        update,
      },
    };

    await writeSourceBinding(tx as never, "content-id", [imageElement()], {
      platform: "qq",
      messageId: "msg",
      fileId: "file",
      groupId: "group",
      userId: "user",
      raw: { a: 1 },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "source-id" },
      data: expect.objectContaining({
        contentId: "content-id",
        platformGroupId: "group",
        platformUserId: "user",
        platformFileId: "file",
        raw: { a: 1 },
      }),
    });
  });
});
