export interface ShapedLine {
  text: string
  advance: number
}

export interface LayoutBlock {
  id: string
  type: 'scene_heading' | 'action' | 'character_cue' | 'dialogue' | 'parenthetical' | 'transition'
  lines: ShapedLine[]
  keepWithNext?: boolean
}

export interface PageLayout {
  pageNumber: number
  blocks: Array<LayoutBlock & { top: number; bottom: number }>
}

export interface PaginationOptions {
  pageHeight: number
  topMargin: number
  bottomMargin: number
  lineHeight: number
  blockGap: number
}

export function paginate(blocks: LayoutBlock[], options: PaginationOptions): PageLayout[] {
  const pages: PageLayout[] = []
  let page: PageLayout = { pageNumber: 1, blocks: [] }
  let cursor = options.topMargin
  const contentBottom = options.pageHeight - options.bottomMargin

  const startNewPage = () => {
    pages.push(page)
    page = { pageNumber: page.pageNumber + 1, blocks: [] }
    cursor = options.topMargin
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) continue
    const height = Math.max(1, block.lines.length) * options.lineHeight
    const next = blocks[index + 1]
    const nextHeight = next ? Math.max(1, next.lines.length) * options.lineHeight + options.blockGap : 0
    const required = height + (block.keepWithNext ? nextHeight : 0)

    if (page.blocks.length > 0 && cursor + required > contentBottom) startNewPage()

    const top = cursor
    const bottom = top + height
    page.blocks.push({ ...block, top, bottom })
    cursor = bottom + options.blockGap
  }

  pages.push(page)
  return pages
}
