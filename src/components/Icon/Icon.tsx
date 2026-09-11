import React from 'react'
import searchUrl from '../../assets/zappicon/search.svg'
import syncUrl from '../../assets/zappicon/arrow-rotate-right.svg'
import tasksUrl from '../../assets/zappicon/check-list.svg'
import settingsUrl from '../../assets/zappicon/gear.svg'
import recentUrl from '../../assets/zappicon/clock.svg'
import folderUrl from '../../assets/zappicon/folder.svg'
import fileUrl from '../../assets/zappicon/file.svg'
import documentUrl from '../../assets/zappicon/file-text.svg'
import pdfUrl from '../../assets/zappicon/file-pdf.svg'
import archiveUrl from '../../assets/zappicon/file-zip.svg'
import imageUrl from '../../assets/zappicon/image.svg'
import videoUrl from '../../assets/zappicon/video.svg'
import audioUrl from '../../assets/zappicon/music.svg'
import appUrl from '../../assets/zappicon/desktop.svg'
import copyUrl from '../../assets/zappicon/clipboard.svg'
import shareUrl from '../../assets/zappicon/share.svg'
import trashUrl from '../../assets/zappicon/trash.svg'
import plusUrl from '../../assets/zappicon/plus.svg'
import closeUrl from '../../assets/zappicon/xmark.svg'
import backUrl from '../../assets/zappicon/arrow-left-small.svg'
import checkUrl from '../../assets/zappicon/check.svg'
import aiUrl from '../../assets/zappicon/sparkles.svg'
import styles from './Icon.module.css'

const iconUrls = {
  search: searchUrl,
  sync: syncUrl,
  tasks: tasksUrl,
  settings: settingsUrl,
  recent: recentUrl,
  folder: folderUrl,
  file: fileUrl,
  document: documentUrl,
  pdf: pdfUrl,
  archive: archiveUrl,
  image: imageUrl,
  video: videoUrl,
  audio: audioUrl,
  app: appUrl,
  copy: copyUrl,
  share: shareUrl,
  trash: trashUrl,
  plus: plusUrl,
  close: closeUrl,
  back: backUrl,
  check: checkUrl,
  ai: aiUrl
} as const

export type IconName = keyof typeof iconUrls

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 20, className = '' }: IconProps): React.ReactElement {
  return (
    <span
      className={`${styles.icon} ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url("${iconUrls[name]}")`,
        maskImage: `url("${iconUrls[name]}")`
      }}
    />
  )
}
