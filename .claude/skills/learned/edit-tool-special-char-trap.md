---
name: edit-tool-special-char-trap
description: "Edit 工具处理含尖括号/XML标签样式内容时可能写入字面参数 tag — 改用 Write 重写整个文件更安全"
user-invocable: false
origin: auto-extracted
---

# Edit 工具特殊字符陷阱

**Extracted:** 2026-05-18
**Context:** 用 Edit 工具修改 bin/claude-profile.js(一段长的 switch-case JS 文件)时,字面 `</antml_parameter>` tag 文本被注入到了源码中,导致 TypeScript 报 "Declaration or statement expected [1128]"

## Problem

Edit 工具的 `old_string` / `new_string` 参数在底层是嵌套的 XML 风格协议传递的。当待编辑内容里大量出现:

- `<` `>` 符号(JSX、HTML、XML、generic bracket)
- 多行 + 嵌套引号的复杂字符串
- 与协议保留 tag 名相近的标识符

参数边界可能被误判,后果包括:

- 字符串被截断、转义错乱
- 字面 `</antml_parameter>` / `</antml_invoke>` 文本被写入文件
- 工具仍返回成功,但文件实际内容已损坏
- 类型检查报出与改动无关的语法错误

## Solution

### 触发预警信号

修改前评估:
- 待编辑文件 / 区段含大量尖括号
- 替换的 old/new 跨越数十行
- new_string 中含未转义的引号嵌套或反引号
- 上一次 Edit 后类型检查/lint 报出无法解释的语法错误

### 改用 Write 重写

```text
1. Read 拿到当前最新文件全文
2. 在自己的工作区(本回合的推理中)拼好新文件的完整内容
3. Write 全量覆盖,绕开 Edit 的 diff 协议
```

### 损坏后恢复

如果已经触发损坏:
- 用 git diff 或 git checkout 还原
- 或直接 Read 最近的备份/上一个 commit,Write 重建

## When to Use

- 编辑 CLI bin 文件、含 JSX 的组件、含模板字符串的代码生成器
- 看到与本次改动无关的 "Declaration or statement expected"、"Unexpected token"
- 单个 Edit 替换跨越 >50 行 或 含 5+ 处特殊字符
- 重复 Edit 同一文件、每次都出意外

## Related

- 与 `typescript-cli-dist-sync-trap` 配合: bin/ 损坏后即使 `npm run build` 成功,运行时也会从损坏的源派生出错误 dist/
