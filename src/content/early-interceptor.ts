import {installPageScript} from './page-bridge'

export default function initial() {
  installPageScript()
  return () => undefined
}
