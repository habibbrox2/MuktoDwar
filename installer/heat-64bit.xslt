<?xml version="1.0" encoding="utf-8"?>
<!--
  Mark every harvested component as a 64-bit component.

  The package is built for x64: the application belongs in the real
  Program Files and the registry values in the 64-bit view of the
  registry. Windows Installer decides which view a component writes to
  from the component itself, so every component that the harvest
  produces has to say so.

  The harvest does not know the platform of the package, so this
  transform is applied to it while it is being built.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes" />

  <xsl:template match="@*|node()">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()" />
    </xsl:copy>
  </xsl:template>

  <xsl:template match="*[local-name()='Component']">
    <xsl:copy>
      <xsl:apply-templates select="@*" />
      <xsl:attribute name="Win64">yes</xsl:attribute>
      <xsl:apply-templates select="node()" />
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
