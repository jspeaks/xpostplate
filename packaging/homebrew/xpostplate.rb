# Head-only until the first GitHub release. On that release, replace `head`
# with the GitHub tag archive URL and the real sha256 of that tarball.
# `brew install xpostplate` stays blocked until this formula lives in a tap.
# It is not in homebrew-core.
# Licensed MIT. Still not a homebrew-core formula.
class Xpostplate < Formula
  desc "Render or fabricate an X post as a PNG"
  homepage "https://github.com/jspeaks/xpostplate"
  head "https://github.com/jspeaks/xpostplate.git", branch: "main"

  depends_on "node"

  def install
    libexec.install "assets", "bin", "fixtures", "lib", "package.json", "package-lock.json"
    pkgshare.install "skills"
    # Rendering deps (@resvg/resvg-js, sharp) ship prebuilt binaries as optional
    # per-platform packages; no install scripts or system libraries are needed.
    cd libexec do
      system "npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
             "--cache=#{HOMEBREW_CACHE}/npm_cache"
    end
    (bin/"xpostplate").write <<~SH
      #!/bin/bash
      export PATH="#{Formula["node"].opt_bin}:${PATH}"
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/xpostplate.js" "$@"
    SH
  end

  def caveats
    <<~EOS
      Agent skill ships at:
        #{opt_pkgshare}/skills/xpostplate/SKILL.md
      Symlink that folder into your agent skills directory (e.g. ~/.agents/skills/xpostplate).
    EOS
  end

  test do
    assert_match(/^\d+\.\d+\.\d+/, shell_output("#{bin}/xpostplate --version"))
    system bin/"xpostplate", "--fixture", "-o", testpath/"plate.png"
    assert_path_exists testpath/"plate.png"
  end
end
