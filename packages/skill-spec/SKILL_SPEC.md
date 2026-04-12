# Hermes UI `skill.json` 规范（v1.0.0）

单一事实来源：`schema.json`（JSON Schema Draft 2020-12）。服务端安装/校验必须使用同一份 Schema。

## 必填字段

- `specVersion`：固定为 `1.0.0`（规范版本，与技能包 `version` 不同）。
- `package.name`：`namespace/name`，小写，仅 `[a-z0-9._-]`。
- `version`：SemVer 2.0.0 兼容字符串。
- `entrypoints`：非空对象，键为入口名，值为相对仓库根的路径字符串。

## 可选字段

- `hermes.minEngine` / `hermes.engine`：引擎约束提示（UI/安装器可警告）。
- `permissions`：声明所需能力标签（由运行时装载器解释）。
- `dependencies`：依赖的 `package.name` → 版本范围（npm 风格 `^`/`~` 或精确版本，解析逻辑由安装器实现）。
- `meta`：`license`、`authors`、`tags`、`homepage`、`repository`。

Mock 与生产技能包均须通过 Schema 校验；校验失败应返回可读 400 错误。
